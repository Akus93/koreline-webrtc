// Load required modules
var http    = require("http");              // http server core module
var express = require("express");           // web framework external module
//var serveStatic = require('serve-static');  // serve static files
var socketIo = require("socket.io");        // web socket external module
var easyrtc = require("easyrtc");               // EasyRTC external module

// Set process name
process.title = "node-easyrtc";

// Setup and configure Express http server. Expect a subfolder called "static" to be the web root.
var app = express();
//app.use(serveStatic('static', {'index': ['index.html']}));

// Start Express http server on port 8080
var webServer = http.createServer(app).listen(8080);

// Start Socket.io so it attaches itself to Express server
var socketServer = socketIo.listen(webServer, {"log level":1});

//easyrtc.setOption("logLevel", "debug");

//MY SETTINGS
easyrtc.setOption("roomAutoCreateEnable", true);
easyrtc.setOption("roomDefaultEnable", true);

// Overriding the default easyrtcAuth listener, only so we can directly access its callback
easyrtc.events.on("easyrtcAuth", function(socket, easyrtcid, msg, socketCallback, callback) {
    easyrtc.events.defaultListeners.easyrtcAuth(socket, easyrtcid, msg, socketCallback, function(err, connectionObj){
        if (err || !msg.msgData || !msg.msgData.credential || !connectionObj) {
            callback(err, connectionObj);
            return;
        }

        connectionObj.setField("credential", msg.msgData.credential, {"isShared":false});
        connectionObj.setCredential(msg.msgData.credential, function (err) {
            if (err)
                console.log(err);
        });


            //connectionObj.setCredential(msg.msgData.credential);

        console.log("["+easyrtcid+"] Credential saved!", connectionObj.getFieldValueSync("credential"));

        callback(err, connectionObj);
    });
});

//To test, lets print the credential to the console for every room join!
easyrtc.events.on("roomJoin", function(connectionObj, roomName, roomParameter, callback) {
    console.log("["+connectionObj.getEasyrtcid()+"] Credential retrieved!", connectionObj.getFieldValueSync("credential"));

    //Sprawdzam czy ten uczen jest juz w jakims pokoju
    //console.log('connectionObj.rooms='+connectionObj.getRoomNames);
    console.log('connectionObj.username='+connectionObj.getUsername());
    
    if (connectionObj.getRoomNames.length) {

    }

    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
});


//MOJE
easyrtc.events.on("roomCreate", function(appObj, creatorConnectionObj, roomName, roomOptions, callback) {


    //TODO sprawdza w bazie czy to nauczyciel
    //console.log('[TWORZE POKÓJ] if:'+creatorConnectionObj.getEasyrtcid());

    easyrtc.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);

});

//MOJE END

easyrtc.events.on("authenticate", function(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next){
    console.log('AUTH appName='+appName+ ' username='+username + ' token='+credential['token']);
  if (appName == "korelineWebRtc" && username != "Akus"){
    next(new easyrtc.util.ConnectionError("Failed our private auth."));
  }
  else {
    next(null);
  }
});


// Start EasyRTC server
var rtc = easyrtc.listen(app, socketServer, null, function(err, rtcRef) {
    console.log("Initiated");
});


//listen on port 8080
webServer.listen(8080, function () {
    console.log('listening on http://localhost:8080');
});
