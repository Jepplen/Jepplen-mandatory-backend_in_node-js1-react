// ============================================
const ioClient = require("socket.io-client");
const express = require("express")
const app = require("express")();
const fs = require("fs");
const { v4: uuidv4 } = require('uuid');

const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.json());

const PORT = 8080;
// ============================================

let debug = [];
const db_users_PATH = "./database/db_users.txt";
const db_permanentRooms_PATH = "./database/db_permanent_rooms.txt";
const db_premiumRooms_PATH = "./database/db_premium_rooms.txt";
const db_activeRooms_PATH = "./database/db_rooms.txt";
const db_deletedRooms_PATH = "./database/db_deleted_rooms.txt";
const passwordOfCreation = uuidv4();
let botNumber = 0;
let messageId = 0;
let deletedRooms = [];
let activeRooms = [];
let users = [];
let premiumGen = [];
let premiumRooms = [];
let permanentRooms = [
  {
    name: "General",
    status: "permanent",
    id: null,
    first: true
  },
  {
    name: "Off-Topic",
    status: "permanent",
    id: null,
    first: false
  }
];
readFile();

function readFile(){
  fs.readFile(db_premiumRooms_PATH, (err, data) => {
    if (err) {return;}
    let dataPARSED = JSON.parse(data);
    for (let room of dataPARSED) {
      let newRoom = {
        name: room.name,
        id: uuidv4(),
        status: "premium",
        owners: [],
        chatLog: [],
        currentStatus: "active"
      };
      premiumGen.push(newRoom);
    }
    generateRooms(premiumGen);
  });
}

function initializeDatabase(databases){

  for (let i = 0; i < databases.length; i++) {
    fs.readFile(databases[i].path, (err, data) => {
      if (err) {
        let dataJSON = JSON.stringify(databases[i].database);
        fs.writeFile(databases[i].path, dataJSON, (err) => {
          if (err){
            console.log("Created file: " + databases[i].path.substring(2));
          }

        });
      } else {
        let dbPARSED = JSON.parse(data);
        if (databases[i].path === db_permanentRooms_PATH){
            permanentRooms = [];
          if (dbPARSED.length > 0){
            for (let element of dbPARSED) {
              permanentRooms.push(element);
            }
          }
          updateDatabase(databases[i].path, permanentRooms);
        } else if (databases[i].path === db_premiumRooms_PATH){
          premiumRooms = [];
          if (dbPARSED.length > 0){
            for (let element of dbPARSED) {
              premiumRooms.push(element);
            }
          }
          updateDatabase(databases[i].path, premiumRooms);
        } else if (databases[i].path === db_users_PATH){
          users = [];
          if (dbPARSED.length > 0){
            for (let element of dbPARSED) {
              users.push(element);
            }
          }
          for (let user of users) {
            if (user.status === "chatbot"){
              user.disabled = true;
              user.currentRoom = "botGraveyard";
            }
          }
          updateDatabase(databases[i].path, users);
        } else if (databases[i].path === db_deletedRooms_PATH){
          deletedRooms = [];
          if (dbPARSED.length > 0){
            for (let element of dbPARSED) {
              deletedRooms.push(element);
            }
          }
          updateDatabase(databases[i].path, deletedRooms);
        }
      }
    });
  }
}

function updateDatabase(path, database){
  let premiumDatabase = [];
  let permanentDatabase = [];
  if (path === db_premiumRooms_PATH){
    for (let activeRoom of activeRooms) {
      if (activeRoom.status === "premium"){
        premiumDatabase.push(activeRoom);
      }
    }
  } else if (path === db_permanentRooms_PATH)
  if (permanentDatabase.length !== 0) {
    for (let activeRoom of activeRooms) {
      if (activeRoom.status === "permanent"){
        permanentDatabase.push(activeRoom);
      }
    }
  }

  const databaseJSON = JSON.stringify(database);
  fs.writeFile(path, databaseJSON, (err) => {
    if (err) throw err;
  });
}

initialize(users, permanentRooms, premiumRooms, deletedRooms);

function initialize(users, permanentRooms, premiumRooms, deletedRooms){
  initializeDatabase(
    [
      {
        path: db_users_PATH,
        database: users
      },
      {
        path: db_permanentRooms_PATH,
        database: permanentRooms
      },
      {
        path: db_premiumRooms_PATH,
        database: premiumRooms
      },
      {
        path: db_deletedRooms_PATH,
        database: deletedRooms
      }
    ]
  );
  generateRooms(permanentRooms);
}

function generateRooms(rooms){
  for (let room of rooms) {
    if (room.status === "permanent" || room.status === "premium"){
      let botData = generateBotClient();
      const socket = botData.socket;
      for (let bot of users) {
        if (bot.username === botData.username){
          bot.ownerOfRooms.push(room.name);
        }
      }
      const data = {
        room: room.name,
        username: botData.username,
        status: room.status,
        exists: true,
        first: room.first || false,
        currentStatus: "active"
      };
      socket.emit("create_room", data, function(response){});
    }
  }
}

function generateBotClient(){
  const socket = ioClient("http://localhost:8080");
  let socketId = null;

  botNumber++;
  const botName = "@ChatBot_" + botNumber;
  const data = {
    username: botName,
    password: passwordOfCreation,
  };

  socket.emit("new_bot", data);

  const botData = {
    username: botName,
    socket: socket,
    status: "chatbot",
    id: uuidv4()
  }
  return botData;
}

function generateBotForRoom(room){
  const botObject = generateBotClient();
  const botName = botObject.username;
  const socket = botObject.socket;
  for (let bot of users) {
    if (bot.username === botName){
      bot.ownerOfRooms.push(room);
      bot.currentRoom = room;
    }
  }

  const botObjectModified = {
    username: botObject.username,
    id: botObject.id
  };

  for (let activeRoom of activeRooms) {
    if (activeRoom.name === room){
      activeRoom.owners.push(botObjectModified);
      break;
    }
  }
  socket.emit("join", room);
  sendToAllRoomClients(io, room);
}

function sendToAllRoomClients(io, room){
  let localClients = [];
  for (let user of users) {
    if (user.currentRoom === room){
      let admin = "";
      if (user.status === "admin"){
        admin = {...user};
        admin.username = "#" + admin.username;
      }
      let ownedObject = {};
      for (let ownedRoom of user.ownerOfRooms) {
        if (ownedRoom === user.currentRoom){
          if (user.status === "user"){
            ownedObject = {...user};
            ownedObject.username = "@" + ownedObject.username;
          }
        }
      }
      if (ownedObject.username){
        localClients.push(ownedObject);
      } else if (admin.username) {
        localClients.push(admin);
      } else {
        localClients.push(user);
      }
    }
  }
  io.in(room).emit("to_all_room_clients", localClients);
}

function setCurrentRoomToUser(room, socketId){
  for (let user of users) {
    if (user.id === socketId){
      user.currentRoom = room;
    }
  }
}

function findUserObject(socketId){
  let userObject = {};
  for (let user of users) {
    if (user.id === socketId){
      userObject = {...user};
      return userObject;
    }
  }
  return false;
}

function findUserIndex(socketId){
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === socketId){
      return i;
    }
  }
  return false;
}

function findUser(socket){
  let socketIdArray = socket.id.split("");
  let socketIdString = JSON.stringify(socketIdArray);
  let userObject = {};
  let index = null;
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === socket.id){
      userObject = {...users[i]};
      index = i;
    }
  }

  const data = {
    username: userObject.username,
    index: index
  };
  return data;
}

function findAdmin(username, socketId){
  for (let i = 0; i < users.length; i++) {
    if (users[i].status === "admin"){
      if (users[i].username === username && users[i].id === socketId){
        return i;
      }
    }
  }
  return false;
}

function findOwner(room, username, socketId){
  for (let i = 0; i < users.length; i++){
    if (users[i].username === username){
      for (let j = 0; j < users[i].ownerOfRooms.length; j++){
        if (users[i].ownerOfRooms[j] === room.name){
          for (let k = 0; k < room.owners.length; k++) {
            if(room.owners[k].username === username && room.owners[k].id === socketId){
              return i;
            }
          }
        }
      }
    }
  }
  return false;
}

function findBotIndex(room) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].status === "chatbot" && users[i].currentRoom === room){
      return i;
    }
  }
  return false;
}

function findRoomIndex(room, database){
  for (let i = 0; i < database.length; i++) {
    if (database[i].name === room){
      return i;
    }
  }
  return false;
}

function findChatLog(room){
  for (let activeRoom of activeRooms) {
    if (activeRoom.name === room){
      return activeRoom.chatLog;
    }
  }
  return false;
}

// ======== Socket IO connection ========
io.on("connection", (socket) => {
  console.log(socket.id + " connected to server");
  io.emit("debug", debug);

  // Delete all database documents
  socket.on("empty_db", function(data) {
    fs.unlink(db_users_PATH, (err) => {
      if (err) {console.log("FILE DELETE ERROR");};
      console.log(db_users_PATH + " was deleted");
    });
    fs.unlink(db_permanentRooms_PATH, (err) => {
      if (err) {console.log("FILE DELETE ERROR");};
      console.log(db_permanentRooms_PATH + " was deleted");
    });
    fs.unlink(db_premiumRooms_PATH, (err) => {
      if (err) {console.log("FILE DELETE ERROR");};
      console.log(db_premiumRooms_PATH + " was deleted");
    });
    fs.unlink(db_deletedRooms_PATH, (err) => {
      if (err) {console.log("FILE DELETE ERROR");};
      console.log(db_deletedRooms_PATH + " was deleted");
    });
  });

  // Send all active rooms to all clients upon connection to server
  io.emit("allRooms", activeRooms);

  // ======== Update account type to Premium ======
  socket.on("upgrade_to_premium", function(user, callback){

    let userIndex = findUserIndex(socket.id);
    if (users[userIndex].accountType === "basic"){
      users[userIndex].accountType = "premium";
      const response = {
        accountType: "premium",
        status: 200
      };
      callback(response);
    }
    updateDatabase(db_users_PATH, users);
  });

  // ======== Someone is typing ========
  socket.on("typing", function(room) {
    socket.to(room).emit("typing", "Someone is typing...");
  });
  socket.on("stopped_typing", function(room) {
    socket.to(room).emit("stopped_typing", "Typing stopped");
  });

  // ======== Create new bot ========
  socket.on("new_bot", function(data) {

    // Validate that no unauthorized clients connects as early as possible
    if (typeof data !== "object"){
      return;
    } else {
      if (typeof data === "object" && data === null) {
        return;
      } else {
        if (!data.hasOwnProperty("password")) {
          return;
        } else {
          if (data.password !== passwordOfCreation){
            return;
          }
        }
      }
    }

    const botObject = {
      username: data.username,
      id: socket.id,
      status: "chatbot",
      currentRoom: "",
      ownerOfRooms: [],
      disabled: false,
      accountType: "bot"
    };
    users.push(botObject);
    updateDatabase(db_users_PATH, users);
  });

  // ======== Create new user ========
  socket.on("new_user", function(user, callback) {
    let response = {
      username: user,
      unique: true,
      status: 201,
      accountType: "basic"
    };

    let found = false;

    if (users.length > 0) {
      for (let userObject of users) {
        if (userObject.username === user){
          found = true;
          break;
        }
      }
    }

    if (!found) {
      if (user === "Admin_1" || user === "Admin_2"){
        const adminObject = {
          username: user,
          id: socket.id,
          status: "admin",
          currentRoom: "",
          ownerOfRooms: [],
          accountType: "admin"
        };
        response.accountType = adminObject.accountType;
        users.push(adminObject);
        updateDatabase(db_users_PATH, users);
      } else {
        const userObject = {
          username: user,
          id: socket.id,
          status: "user",
          currentRoom: "",
          ownerOfRooms: [],
          accountType: "basic"
        };
        response.accountType = userObject.accountType;
        users.push(userObject);
        updateDatabase(db_users_PATH, users);
      }
    } else {
      response.unique = false;
      response.status = 409;
    }
    callback(response);
  });

  // ========= Create new room =========
  socket.on("create_room", function(data, callback) {
    // Check if room name is unique
    let nameIsUnique = true;
    if (deletedRooms.length > 0){
      for (let room of deletedRooms) {
        if (room.name === data.room) {
          nameIsUnique = false;
          break;
        }
      }
    }
    if (activeRooms.length > 0 && nameIsUnique) {
      for (let room of activeRooms) {
        if (room.name === data.room) {
          nameIsUnique = false;
          break;
        }
      }
    }

    if (data.status === "permanent"){
      nameIsUnique = true;
    }

    let response = {
      unique: true,
      status: 201
    };

    if (nameIsUnique){
      const userIndex = findUserIndex(socket.id);
      const botIndex = findBotIndex(data.room);
      const roomIndex = findRoomIndex(data.room, activeRooms);

      users[userIndex].ownerOfRooms.push(data.room);
      users[userIndex].currentRoom = data.room;

      let roomStatus = data.status;
      if (users[userIndex].accountType === "premium" && data.status !== "permanent"){
        roomStatus = users[userIndex].accountType;
      }

      let newRoom = {
        name: data.room,
        id: uuidv4(),
        status: roomStatus || "basic",
        owners: [
          {
            username: data.username,
            id: socket.id
          }
        ],
        chatLog: [],
        currentStatus: data.currentStatus || "active"
      };


      for (let permanentRoom of permanentRooms) {
        if (permanentRoom.name === data.room){
          if (permanentRoom.chatLog){
            newRoom.chatLog = permanentRoom.chatLog;
          }
        }
      }

      for (let premiumRoom of premiumRooms) {
        if (premiumRoom.name === data.room){
          if (premiumRoom.chatLog){
            newRoom.chatLog = premiumRoom.chatLog;
          }
        }
      }

      console.log("Created new room: " + newRoom.name);

      sendToAllRoomClients(io, data.room);

      if (users[userIndex].accountType === "premium") {
        generateBotForRoom(data.room);
      }

      if (roomStatus === "permanent"){
        if(data.first === true){
          permanentRooms = [];
        }
        permanentRooms.push(newRoom);
        updateDatabase(db_permanentRooms_PATH, permanentRooms);
      } else if (roomStatus === "premium"){
        premiumRooms.push(newRoom);
        updateDatabase(db_premiumRooms_PATH, premiumRooms);
      }

      activeRooms.push(newRoom);
      io.emit("allRooms", activeRooms);
      socket.join(data.room);
    } else {
      response.unique = false;
      response.status = 409;
    }
    callback(response);
    updateDatabase(db_users_PATH, users);
  });

  // ======== Client joins room ========
  socket.on("join", function(room) {
    // Update which room the user currently is inside
    setCurrentRoomToUser(room, socket.id);

    // Joining room on socket
    socket.join(room);

    // Sends all connected room clients to joining client
    sendToAllRoomClients(io, room);

    console.log("Joined: " + room);

    // Get chatlog of current room
    const chatLog = findChatLog(room);

    // Extract data from chatLog and send to the joining client
    let dataOfChatLog = [];
    for (let chatObject of chatLog) {
      const newChatObject = {
        username: chatObject.username,
        message: chatObject.message
      };
      dataOfChatLog.push(newChatObject);
    }

   // Save in log that the user has joined
     messageId++;
     const userIndex = findUserIndex(socket.id);
     const botIndex = findBotIndex(room);
     const roomIndex = findRoomIndex(room, activeRooms);

     let username;

     if (userIndex === botIndex){
       username = "(System)"
     }

     if(!botIndex){
       username = "(System)"
     }

     const newMessageObject = {
       username: username || users[botIndex].username,
       room: room,
       date: Date.now(),
       message: users[userIndex].username + " has joined the room",
       messageId: messageId
     };
     activeRooms[roomIndex].chatLog.push(newMessageObject);

    // Send to all clients in room except socket.id that the user has joined
    const data = {
      username: username || users[botIndex].username,
      message: users[userIndex].username + " has joined the room"
    };
    io.in(room).emit("message", data);

    if (!!chatLog){
      socket.emit("chat_log", dataOfChatLog);
    }
    if (activeRooms[roomIndex].status === "premium"){
     updateDatabase(db_premiumRooms_PATH, premiumRooms);
   } else if (activeRooms[roomIndex].status === "permanent"){
     updateDatabase(db_permanentRooms_PATH, permanentRooms);
   }
  });

  // ======== User leaves room ========
  socket.on("leave", function(room) {
    const userIndex = findUserIndex(socket.id);
    const roomIndex = findRoomIndex(room, activeRooms);

    const botIndex = findBotIndex(room);
    let username = false;
    if (botIndex){
      username = users[botIndex].username;
    }

    // =================================================
      messageId++;
      const newMessageObject = {
        username: username || "(System)",
        room: room,
        date: Date.now(),
        message: users[userIndex].username + " has left the room",
        messageId: messageId
      };
      activeRooms[roomIndex].chatLog.push(newMessageObject);
     // =======================================================

    const data = {
      username: username || "(System)",
      message: users[userIndex].username + " has left the room"
    };
    socket.leave(room);
    io.in(room).emit("message", data);
    console.log("Left " + room);
    users[userIndex].currentRoom = "";
    sendToAllRoomClients(io, room);
    updateDatabase(db_users_PATH, users);
    updateDatabase(db_premiumRooms_PATH, premiumRooms);
  });

  // ======== New message sent in room ========
  socket.on("new_message", (data) => {
    console.log("Message sent in: " + data.room);
    messageId++;
    const userObject = findUserObject(socket.id);

    const messageObject = {
      username: userObject.username,
      room: data.room,
      date: Date.now(),
      message: data.data.message,
      messageId: messageId
    };

    const roomIndex = findRoomIndex(data.room, activeRooms);
    activeRooms[roomIndex].chatLog.push(messageObject);

    const dataObject = {
      username: data.data.username,
      message: data.data.message
    };
    socket.broadcast.to(data.room).emit("message", dataObject);
    if (activeRooms[roomIndex].status === "permanent"){
      updateDatabase(db_permanentRooms_PATH, permanentRooms);
    } else if (activeRooms[roomIndex].status === "premium")
      updateDatabase(db_premiumRooms_PATH, premiumRooms);
  });

  // ======== Delete room ========
  socket.on("delete_room", function(data, callback) {

    // Check if room only has one connected client,
    // if so authorize deletion of basic room
    let authorizedBasicUser = false;
    let clientsInRoom = [];
    for (let user of users) {
      if (user.currentRoom === data.room){
        clientsInRoom.push(user.username);
      }
    }
    if(clientsInRoom.length < 2){
      authorizedBasicUser = true;
    }
    // ================

    let room = {};
    for (let activeRoom of activeRooms) {
      if (activeRoom.name === data.room){
        room = activeRoom;
      }
    }

    let response = {
      error: "This room cannot be deleted",
      status: 401
    };

    if (room.status === "permanent"){
      callback(response);
      return;
    }


    let userObject = findUser(socket);

    let authorized = findAdmin(data.username, socket.id);
    if (!authorized){
      authorized = findOwner(room, data.username, socket.id);
    }

    if (authorized || authorizedBasicUser){
      const roomIndex = findRoomIndex(room.name, activeRooms);
      if (!roomIndex){
        response.error = "This room does not exist";
        response.status = 404;
        callback(response);
        return;
      }

      let botIndex = findBotIndex(data.room);
      if (botIndex){
        users[botIndex].currentRoom = "";
        users[botIndex].disabled = true;
      }

      const deletedRoom = {
        name: room.name,
        id: room.id,
        dateDeleted: Date.now(),
        deletedBy: userObject.username,
        userId: userObject.id,
        userStatus: userObject.status,
        chatLog: activeRooms[roomIndex].chatLog,
        currentStatus: "deleted"
      }
      deletedRooms.push(deletedRoom);

      io.of("/").in(data.room).clients((error, socketIds) => {
        if (error) throw error;
        socketIds.forEach(socketId => {
          io.in(data.room).emit("room_deleted", data.room);
          io.sockets.sockets[socketId].leave(data.room);
        });
      });

      if (roomIndex) {
        activeRooms.splice(roomIndex, 1);
        const premiumRoomIndex = findRoomIndex(room.name, premiumRooms);
        premiumRooms.splice(premiumRoomIndex, 1);
      }

      io.emit("allRooms", activeRooms);
      response.status = 200;
      console.log(`Room ${data.room} was deleted`);
      response = {
        success: "Room successfully deleted",
        status: 204
      };
    }
    else {
      response.error = "This room can only be deleted by an Admin or its' Owner";
    }
    callback(response);
    updateDatabase(db_premiumRooms_PATH, premiumRooms);
    updateDatabase(db_users_PATH, users);
    updateDatabase(db_deletedRooms_PATH, deletedRooms);
  });
});


http.listen(PORT, () => {
console.log(`Server started on port ${PORT}`);
});
