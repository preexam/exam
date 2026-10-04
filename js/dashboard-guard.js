(function(){
  try {
    if (!sessionStorage.getItem("candidateApp")) {
      window.location.replace("./application.html");
    }
  } catch (_) {
    window.location.replace("./application.html");
  }
})();
