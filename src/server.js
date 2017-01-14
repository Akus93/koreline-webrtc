var http    = require("http");             
var express = require("express");          
var socketIo = require("socket.io");        
var easyrtc = require("easyrtc");
var pg = require("pg");
var redis = require("redis");

//process.title = "koreline-easyrtc";

process.on('uncaughtException', function (err) {
    console.error(err);
});

var port = process.env.PORT || 3000;
var app = express();
var webServer = http.createServer(app).listen(port);
var socketServer = socketIo.listen(webServer, {"log level":1});

//REDIS
var redisConfig = {
    host: 'pub-redis-14529.eu-central-1-1.1.ec2.redislabs.com',
    port: 14529,
    password: '12345678'
};

var redisClient = redis.createClient(redisConfig);

redisClient.on("error", function (error) {
    console.error("Redis error", error);
});

redisClient.on("connect", function () {
   console.log('Connected to redis server.');
});

//REDIS END


//POSTGRESQL

// var postgresqlConfig = {
//     user: 'akus',
//     database: 'koreline',
//     password: '12345678',
//     host: 'localhost',
//     port: 5432,
// };

var postgresqlConfig = {
    user: 'aqdihmvwjmjopg',
    database: 'desvgmv1blsmmo',
    password: '76b3111574cb410167f8271ff33a97e94188fb282dc1c51d54fe8c24e3f12aba',
    host: 'ec2-54-221-217-158.compute-1.amazonaws.com',
    port: 3306,
};  

var postgreClient = new pg.Client(postgresqlConfig);

postgreClient.on('error', function(error) {
    console.error('PostgreSQL Client Error', error);
});

postgreClient.connect();

//POSTGRESQL END

//easyrtc.setOption("logLevel", "debug");

//MY SETTINGS

var iceServers = [
    {"url": "stun:stun.l.google.com:19302"},
    {
        "url":"turn:numb.viagenie.ca:3478",
        "username":"dawid.rdzanek@gmail.com",
        "credential":"IIuuqya3"
    }
];

easyrtc.setOption("appIceServers", iceServers);
easyrtc.setOption("roomAutoCreateEnable", true);
easyrtc.setOption("roomDefaultEnable", true);


easyrtc.events.on("disconnect", function (connectionObj, next) {
    console.log('ON DISCONNECT EVENT');
    redisClient.del(connectionObj.getEasyrtcid());
    console.log('Remove data about ' + connectionObj.getEasyrtcid() + ' from redis.');
    easyrtc.events.defaultListeners.disconnect(connectionObj, next);
});


easyrtc.events.on("roomLeave", function (connectionObj, roomName, next) {

    console.log('ON ROOM LEAVE EVENT');

    let app = connectionObj.getApp();
    app.room(roomName, function (error, room) {
        if (error)
            console.error(error);
        else {
            room.getConnectionObjects(function(error, connections) {
               for (let connection of connections) {
                   easyrtc.events.emit(
                       "emitEasyrtcMsg",
                       connection,
                       "roomLeave",
                       { msgData: ''},
                       null,
                       function(err) {
                           console.log("Send message about roomLeave to "+ connection.getEasyrtcid());
                       }
                   );
               }
            });
        }
    });

    console.log('User ' + connectionObj.getEasyrtcid() + ' leave room ' + roomName);

    easyrtc.events.defaultListeners.roomLeave(connectionObj, roomName, next);
});


easyrtc.events.on("roomJoin", function(connectionObj, roomName, roomParameter, callback) {

    console.log('ON ROOM JOIN EVENT');

    redisClient.hgetall(connectionObj.getEasyrtcid(), function (error, obj) {
        if (error)
            console.error('Error from redis', error);
        else {

            let query =
                'SELECT "auth_user"."username" AS teacher, U."username" AS student ' +
                'FROM "koreline_room" ' +
                'INNER JOIN "koreline_lesson" ON ("koreline_room"."lesson_id" = "koreline_lesson"."id") ' +
                'INNER JOIN "koreline_userprofile" ON ("koreline_lesson"."teacher_id" = "koreline_userprofile"."id") ' +
                'INNER JOIN "auth_user" ON ("koreline_userprofile"."user_id" = "auth_user"."id") ' +
                'INNER JOIN "koreline_userprofile" UP ON ("koreline_room"."student_id" = UP."id") ' +
                'INNER JOIN "auth_user" U ON (UP."user_id" = U."id") ' +
                'WHERE "koreline_room"."key" = $1::text';

            postgreClient.query(query, [obj['room']], function (err, result) {

                if (err) throw err;

                if (result.rows.length && (result.rows[0]['teacher'] == obj['username'] || result.rows[0]['student'] == obj['username'])) {
                    console.log('User ' + obj['username'] + ' can join room ' + obj['room']);
                    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
                }
                else
                    console.error('User ' + obj['username'] + ' can not join room ' + obj['room'] + '!');
            });
        }
    });
});


easyrtc.events.on("onShutdown", function(next) {
    console.log('onShutdown fired!');
    redisClient.quit();
    //postgreClient.end();
    easyrtc.events.defaultListeners.onShutdown(next);
});


easyrtc.events.on("roomCreate", function(appObj, creatorConnectionObj, roomName, roomOptions, callback) {
    console.log('roomCreate event for ' + roomName);

    if (creatorConnectionObj) {

        redisClient.hgetall(creatorConnectionObj.getEasyrtcid(), function (error, obj) {
            if (error) {
                console.error('Error from redis', error);
            }
            else {
                let query =
                    'SELECT "auth_user"."username" AS teacher ' +
                    'FROM "koreline_room" ' +
                    'INNER JOIN "koreline_lesson" ON ("koreline_room"."lesson_id" = "koreline_lesson"."id") ' +
                    'INNER JOIN "koreline_userprofile" ON ("koreline_lesson"."teacher_id" = "koreline_userprofile"."id") ' +
                    'INNER JOIN "auth_user" ON ("koreline_userprofile"."user_id" = "auth_user"."id") ' +
                    'WHERE "koreline_room"."key" = $1::text';

                postgreClient.query(query, [obj['room']])
                    .then(result => {
                        if (result.rows.length && result.rows[0]['teacher'] == obj['username']) {
                            console.log('User ' + obj['username'] + ' can create room ' + obj['room']);
                            easyrtc.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);
                        }
                        else {
                            console.error('User ' + obj['username'] + ' can not create room ' + obj['room'] + '!');
                        }
                    });
            }
        });
    }
    else {
        easyrtc.events.defaultListeners.roomCreate(appObj, creatorConnectionObj, roomName, roomOptions, callback);
    }
});


easyrtc.events.on("authenticate", function(socket, easyrtcid, appName, username, credential, easyrtcAuthMessage, next){

    postgreClient.query('SELECT U.username FROM authtoken_token T, auth_user U WHERE T.key=$1::text AND U.id = T.user_id', [credential['token']], function (err, result) {
        if (err) throw err;

        if (result.rows.length) {
            redisClient.HMSET(easyrtcid, {
                username: result.rows[0]['username'],
                room: credential['room']
            });
            console.log('Save credentials about ' + easyrtcid + '[' +  result.rows[0]['username'] + '] to redis database.');
            next(null);
        }
        else {
            next(new easyrtc.util.ConnectionError("Failed auth."));
        }
    });

});

var rtc = easyrtc.listen(app, socketServer, null, function(err, rtcRef) {
    console.log("Initiated");
});

webServer.listen(8080, function () {
    console.log('Listening on http://localhost:8080');
});
