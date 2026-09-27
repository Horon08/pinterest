const { Client } = require('pg');

const client = new Client({
    user: 'postgres', 
    password: 'root', 
    database: 'application_image',
    port: 5432 
});

client.connect()
.then(() => {
    console.log('Connected to database');
})
.catch((e) => {
    console.log('Error connecting to database');
    console.log(e);
});

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const port = 8081;
const server = http.createServer();

let lastSessionId = 0;
let sessions = [];

let nbLikes = 0;

function parseImageId(value) {
    if (!/^\d+$/.test(value)) {
        return null;
    }

    const imageId = Number(value);
    return Number.isSafeInteger(imageId) && imageId > 0 ? imageId : null;
}

server.on('request', async (req, res) => {

    let hasCookieWithSessionId = false;
    let sessionId = undefined;
    if (req.headers['cookie'] !== undefined) {
        let sessionIdInCookie = req.headers['cookie'].split(';').find(item => item.trim().startsWith('session-id'));
        if (sessionIdInCookie !== undefined) {
            let sessionIdInt = parseInt(sessionIdInCookie.split('=')[1]);
            if (sessions[sessionIdInt]) {
                hasCookieWithSessionId = true;
                sessionId = sessionIdInt;
                sessions[sessionId].nbRequest++;
            }
        }
    }

    if (!hasCookieWithSessionId) {
        lastSessionId++;
        res.setHeader('Set-Cookie', `session-id=${lastSessionId}`);
        sessionId = lastSessionId;
        sessions[lastSessionId] = {
            'nbRequest': 0
        }
    }

    
    if (req.url === '/signup' && req.method === 'POST') {

        let data = "";

        req.on("data", (dataChunk) => {
            data += dataChunk.toString();
        });

        req.on("end", async () => {
            try {
                const params = new URLSearchParams(data);
                const username = params.get('username');
                const password = params.get('password');
                if (!username || !password) {
                    res.statusCode = 400;
                    return res.end('Données invalides');
                }

                const findQuery = 'SELECT COUNT(username) FROM accounts WHERE username = $1';
                const findResult = await client.query(findQuery, [username]);
                const USERNAME_IS_UNKNOWN = 0;

                if (parseInt(findResult.rows[0].count) === USERNAME_IS_UNKNOWN) {
                    const salt = crypto.randomBytes(16).toString('hex');
                    const hash = crypto.createHash("sha256").update(password).update(salt).digest("hex");
                    const insertQuery = "INSERT INTO accounts (username, salt, hash) VALUES ($1, decode($2, 'hex'), decode($3, 'hex'))";
                    await client.query(insertQuery, [username, salt, hash]);
                    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>La création de compte a été un succés</h1><a href="/public/signIn.html">Vous pouvez maintenant vous connectez</a></body></html>`);
                } else {
                    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Création du compte échoué </h1><div>Ce nom d'utilisateur est déjà pris !</div><a href="/public/signUp.html">Réessayez</a></body></html>`);
                }
            } catch(e) {
                console.log(e);
                res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Echec</h1><a href="/public/signUp.html">Réessayez</a></body></html>`);
            }
        });
    } 
    
    
    else if (req.url === '/signin' && req.method === 'POST') {

        let data = "";

        req.on("data", (dataChunk) => {
            data += dataChunk.toString();
        });

        req.on("end", async () => {

            try {
                const params = new URLSearchParams(data);
                const username = params.get('username');
                const password = params.get('password');
                if (!username || !password) {
                    res.statusCode = 400;
                    return res.end('Données invalides');
                }

                const findQuery = "SELECT username, encode(salt, 'hex') AS salt, encode(hash, 'hex') AS hash FROM accounts WHERE username = $1";
                const findResult = await client.query(findQuery, [username]);
                const USERNAME_IS_UNKNOWN = 0;

                if (parseInt(findResult.rows.length) !== USERNAME_IS_UNKNOWN) {
                    const salt = findResult.rows[0].salt;
                    const trueHash = findResult.rows[0].hash;
                    const computedHash = crypto.createHash("sha256").update(password).update(salt).digest("hex");

                    if (trueHash === computedHash) {
                        sessions[sessionId].username = username;
                        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Vous êtes connecté !</h1>Bienvenue ${username}. Visitez <a href="/">notre site</a> </body></html>`);
                    } 
                    
                    else {
                        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Connexion échouée</h1> Mauvais mot de passe ! <a href="/public/signIn.html">Réessayer</a></body></html>`);
                    }
                } 
                
                else {
                    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Connexion echouée</h1> Mauvais nom d'utilisateur ! <a href="/public/signIn.html">Réessayer</a></body></html>`);
                }
            } 
            
            catch(e) {
                console.log(e);
                res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/public/signIn.html">Réessayez</a></body></html>`);
            }
        });
    } 


    else if (req.url.startsWith('/public/')) {

        try {
            const file = fs.readFileSync('.' + req.url);
            res.end(file)
        } 
        
        catch (err) {
            console.log(err);
            res.statusCode = 404;
            res.end('Page not found');
        }
    
    }
    
    else if (req.url === '/images') {

        let html = `<!DOCTYPE html><html><head><title>Mur</title><meta charset="utf-8"><link rel="stylesheet" href="/public/style-mur.css"></head><body>
        <a href="/index">Index</a>
        <h1>Mur de toutes les images</h1>
        <div class="gallery-wrapper">`;

        try {

            const sqlQuery = `SELECT id_image FROM IMAGES`;
            const sqlResult = await client.query(sqlQuery);
            const idImage = sqlResult.rows.map(row => row.id_image);

            if (sessions[sessionId] && sessions[sessionId].username) {
                const sqlQueryImagesLiked = 'SELECT id_image FROM accounts_images_like WHERE username = $1';
                const sqlResultImagesLiked = await client.query(sqlQueryImagesLiked, [sessions[sessionId].username]);
                const idImagesLiked = sqlResultImagesLiked.rows.map(row => row.id_image);

                idImage.forEach(idNumber => {

                    html += `
                    <div class="image-container">
                        <a href="/page-image/${idNumber}"><img src="/public/images/image${idNumber}_small.jpg"/></a>
                    <div class="like-link">`;
                    
                    if (idImagesLiked.includes(idNumber)) {
                        html += `<p> Liked <p>`;
                    }

                    else {
                        html += `<a href="/like/${idNumber}">Like</a>`;
                    }
                        
                    html += '</div></div>';
                });
            }

            else {
                idImage.forEach(idNumber => {
                    html += `<a href="/page-image/${idNumber}"><img src="/public/images/image${idNumber}_small.jpg"/></a>`
                });
            }
            
            html += '</div></body></html>';
            res.end(html);
        }

        catch (err) {
            console.log(err);
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/images">Réessayez</a></body></html>`);
        }

    } 
    
    else if (req.url.startsWith('/page-image/')) {

        const imageNumber = parseImageId(req.url.split('/')[2]);
        if (imageNumber === null) {
            res.statusCode = 400;
            return res.end('Identifiant d’image invalide');
        }

        try {
            const sqlQuery = 'SELECT id_auteur, nom FROM IMAGES WHERE id_image = $1';
            const sqlResult = await client.query(sqlQuery, [imageNumber]);

            const numberAuthor = sqlResult.rows[0].id_auteur;
            const sqlAuthorQuery = 'SELECT DISTINCT A.nom AS nomAuteur, A.prenom AS prenomAuteur FROM AUTEURS A JOIN IMAGES I ON A.id_auteur = I.id_auteur WHERE A.id_auteur = $1';
            const sqlResultAuthor = await client.query(sqlAuthorQuery, [numberAuthor]);
            const authorName = sqlResultAuthor.rows[0].nomauteur;
            const authorFirstName = sqlResultAuthor.rows[0].prenomauteur;

            const nameImage = sqlResult.rows[0].nom;

            let html = `<!DOCTYPE html><html><head><title>Image ${imageNumber} </title><meta charset="utf-8"><link rel="stylesheet" type="text/css" href="/public/style-page-image.css">
            </head><body>
            <a href="/images">Mur</a>
            <h1>${nameImage}</h1>
            <h2>${authorName} ${authorFirstName}</h2>
            <br>
            <div id="image_container">`;
            if (imageNumber > 1) {
                html += `<a href="/page-image/${(+imageNumber - 1)}"><img id="small_image_left" src="/public/images/image${(+imageNumber - 1)}_small.jpg" width=auto/></a>`;
            }

            html += `<img id="main_image" src="/public/images/image${imageNumber}.jpg" width=500/>`;

            if (imageNumber < 53) {
                html += `<a href="/page-image/${(+imageNumber + 1)}"><img id="small_image_right" src="/public/images/image${(+imageNumber + 1)}_small.jpg" width=auto/></a>`;
            }
            
            html += `</div>
            <br>
            <div id="comment">
            <h1> Commentaires </h1>`;

            const sqlQueryComments = 'SELECT texte FROM COMMENTAIRES WHERE id_image = $1';
            const sqlResultComments = await client.query(sqlQueryComments, [imageNumber]);
            const comments = sqlResultComments.rows.map(row => row.texte);

            comments.forEach(comment => {
                html += `<p>${comment}</p>`;
            });

            html += `<form id="send_comment" action="/image-description" method="post">

                <input type="hidden" name="image-number" value="${imageNumber}">
                <input type="text" name="description">
                <input type="submit" value="Envoyer">

            </form>
            </div>
            <script src="/public/page_image.js"></script>
            </body></html>`;

            res.end(html);
        }

        catch (err) {
            console.log(err);
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/page-image/${imageNumber}">Réessayez</a></body></html>`);
        }

    }

    else if (req.method == "POST" && req.url == "/image-description") {

        let donnees = "";
        req.on("data", (dataChunk) => {
            donnees += dataChunk.toString();
        });

        req.on("end", async () => {

            try {
                const params = new URLSearchParams(donnees);
                const imageNumber = parseImageId(params.get('image-number'));
                const comment = params.get('description');
                if (imageNumber === null || !comment) {
                    res.statusCode = 400;
                    return res.end('Données invalides');
                }

                const sqlQuery = 'INSERT INTO COMMENTAIRES(id_image, texte) VALUES ($1, $2)';
                await client.query(sqlQuery, [imageNumber, comment]);

                res.statusCode = 302;
                res.setHeader('Location', `/page-image/${imageNumber}`);
                res.end();
            }

            catch (err) {
                console.log(err);
                res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/page-image/${imageNumber}">Revenir à l'image</a></body></html>`);
            }
            
        });
        
    }

    else if (req.method == "GET" && req.url.startsWith("/like/") && sessions[sessionId] && sessions[sessionId].username) {

        try {
            const imageNumber = parseImageId(req.url.split('/')[2]);
            if (imageNumber === null) {
                res.statusCode = 400;
                return res.end('Identifiant d’image invalide');
            }

            const sqlQuery = 'INSERT INTO accounts_images_like(username, id_image) VALUES ($1, $2)';
            await client.query(sqlQuery, [sessions[sessionId].username, imageNumber]);

            res.statusCode = 302;
            res.setHeader('Location', '/images');
            res.end();
        }

        catch (err) {
            console.log(err);
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/images">Revenir au mur d'images</a></body></html>`);
        }
        
    }

    else if (req.method == "GET" && req.url == "/nbLikes" && sessions[sessionId] && sessions[sessionId].username) {

        try {
            const sqlQuery = 'SELECT COUNT(username) AS nbLikes FROM accounts_images_like WHERE username = $1';

            const nbLikes = await client.query(sqlQuery, [sessions[sessionId].username]);
            const realNbLikes = nbLikes.rows[0].nblikes;
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${realNbLikes}</body></html>`);
        }

        catch (err) {
            console.log(err);
            res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>Quelque chose s'est mal passée</h1> <a href="/images">Revenir au mur d'images</a></body></html>`);
        }
        
    }

    else if (req.url === '/logout') {

        if (sessions[sessionId]) {
            sessions[sessionId].username = "";
        }
        
        res.statusCode = 302;
        res.setHeader('Location', '/');
        res.end();
    }
    
    else {
    
            try {
                const sqlQuery = `SELECT id_image FROM IMAGES ORDER BY date DESC LIMIT 3`;
                const sqlResult = await client.query(sqlQuery);
        
                let html = `<!DOCTYPE html>
        
                            <html>
                
                            <head>
        
                                <title>Page d'accueil</title>
        
                                <meta charset="utf-8">
        
                                <link rel="stylesheet" href="/public/style.css">
        
                            </head>
        
                            <body>`;
                
                if (sessions[sessionId] && sessions[sessionId].username) {
                    html += `<header>
                                <div class="welcomeMessage">
                                    <p> Bienvenue ${sessions[sessionId].username} </p>
                                    <a href="/logout"> Se déconnecter </a>
                                </div>
                            </header>`;
                }

                else {
                    html += `<header>
                                    <div class="signInAndSignUp">
                                        <a href="/public/signUp.html"> S'inscrire </a>
                                        <a href="/public/signIn.html"> Se connecter </a>
                                    </div>
                            </header>`;
                }

                html += `<main>
                        <div class="logo-container">
                            <img src="/public/logo.png" alt="logo" width="200">
                            <h1>Le site avec plein d'images</h1>
                        </div>

                        <div class="banner">
                            <bandeau>
                                <a href="/page-image/${sqlResult.rows[0].id_image}"><img src="/public/images/image${sqlResult.rows[0].id_image}_small.jpg" alt="image1"></a>
                                <a href="/page-image/${sqlResult.rows[1].id_image}"><img src="/public/images/image${sqlResult.rows[1].id_image}_small.jpg" alt="image2"></a>
                                <a href="/page-image/${sqlResult.rows[2].id_image}"><img src="/public/images/image${sqlResult.rows[2].id_image}_small.jpg" alt="image3"></a>
                            </bandeau>
                        </div>
                    
                        <div class="button-container">
                            <button>
                                <a href="/images"> Toutes les images </a>
                            </button>
                        </div>
                    </main>

                </body>

                </html>`;

                res.end(html);
            }
    
            catch (err) {
                console.log(err);
                res.end("Erreur de requête !");
            }
    }
});


server.listen(port, () => {
    console.log('Server running');
});
