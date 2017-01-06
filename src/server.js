var http    = require("http");             
var express = require("express");          
var socketIo = require("socket.io");        
var easyrtc = require("easyrtc");
var pg = require("pg");

process.title = "koreline-easyrtc";

var app = express();
var webServer = http.createServer(app).listen(8080);
var socketServer = socketIo.listen(webServer, {"log level":1});

var config = {
    user: 'akus', //env var: PGUSER
    database: 'koreline', //env var: PGDATABASE
    password: '12345678', //env var: PGPASSWORD
    host: 'localhost', // Server hosting the postgres database
    port: 5432, //env var: PGPORT
    max: 10, // max number of clients in the pool
    idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
};

//var client = new pg.Client(config);
var pool = new pg.Pool(config);

pool.on('error', function (err, client) {
    console.error('idle client error', err.message, err.stack)
});

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

    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
});


//MOJE
easyrtc.events.on("roomCreate", function(appObj, creatorConnectionObj, roomName, roomOptions, callback) {


    //TODO sprawdza w bazie czy to nauczyciel
    //console.log('[TWORZE POKÓJ] if:'+creatorConnectionObj.getEasyrtcid());

    easyrtc.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);

});


easyrtc.events.on("authenticate", function(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next){

    pool.connect(function(err, client, done) {
        if(err) {
            return console.error('error fetching client from pool', err);
        }
        client.query('SELECT user_id FROM authtoken_token WHERE key=$1::text', [credential['token']], function(err, result) {
            done();

            if(err) {
                return console.error('error running query', err);
            }
            if (result.rows.length) {
                console.log('Uzytkownik autoryzowany');
                next(null);
            } else {
                next(new easyrtc.util.ConnectionError("Failed auth."));
            }
        });
    });

});

var rtc = easyrtc.listen(app, socketServer, null, function(err, rtcRef) {
    console.log("Initiated");
});

webServer.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
