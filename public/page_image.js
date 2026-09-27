
let mainImage = document.getElementById("main_image");

if (!mainImage.style.width) {
    mainImage.style.width = "500px";
}

mainImage.addEventListener("click", () => {
    let widthImage = parseInt(mainImage.style.width.match(/\d+/));
    widthImage += 10;
    mainImage.style.width = `${widthImage}px`;
});

mainImage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    let widthImage = parseInt(mainImage.style.width.match(/\d+/));
    widthImage -= 10;
    mainImage.style.width = `${widthImage}px`;
});

let submitButton = document.getElementById("send_comment").children[2];
submitButton.disabled = true;

let input = document.getElementById("send_comment").children[1];

input.addEventListener("keyup", () => {
    if (input.value == "") {
      submitButton.disabled = true;
    }
      
    else {
    submitButton.disabled = false;
    }
});
