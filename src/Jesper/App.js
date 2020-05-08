import React, { useEffect, useState, useReducer, useRef } from 'react';
import io from "socket.io-client";
import './App.css';
const socket = io("http://localhost:8080");


export default function App() {
  const messageInput = useRef(null);
  const [userInput, updateUserInput] = useReducer(
    (state, newState) => ({...state, ...newState}),
    {
    user: "",
    new_message: "",
    createRoom: "",
    }
  );

  const [deleteConfirmation, updateDeleteConfirmation] = useState(false);
  const [userStatus, updateUserStatus] = useState("");
  const [roomClients, updateRoomClients] = useState([]);
  const [timeout, updateTimeout] = useState(undefined);
  const [typing, updateTyping] = useState(false);
  const [isTyping, updateIsTyping] = useState(false);
  const [userExists, updateUserExists] = useState(false);
  const [user, updateUser] = useState("");
  const [roomExists, updateRoomExists] = useState(false);
  const [activeRooms, updateActiveRooms] = useState([]);
  const [data, updateData] = useState([]);
  const [currentRoom, updateCurrentRoom] = useState("");
  let id = 0;

  // ======== UseEffect only runs once =========
  useEffect(() => {
    // ======= Adds listeners to various socket events ========
    socket.on("message", (newData) => {
      updateData(data => [...data, newData]);
    });

    socket.on("room_deleted", (room) => {
      console.log("Room is about to be deleted, client forced to leave room " + room);
      updateCurrentRoom("");
      updateRoomClients([]);
      updateData([]);
    });

    socket.on("allRooms", (data) => {
      updateActiveRooms(data);
    });

    socket.on("typing", (data) => {
      updateIsTyping(true);
    });

    socket.on("stopped_typing", (data) => {
      updateIsTyping(false);
    });

    // TODO check and remove
    socket.on("room_clients", (data) => {
      updateRoomClients(data);
    });

    socket.on("to_all_room_clients", (data) => {
      updateRoomClients(data);
    });

    socket.on("chat_log", (newData) => {
      updateData(newData);
    });

    socket.on("debug", (data) => {
    });
  }, [] );

  // ======== User inputs ========
  function onChange(e) {
    const name = e.target.name;
    const value = e.target.value;
    updateUserInput({[name]: value});

    if (name === "new_message"){
      onKeyDownNotEnter();
    }
  }

  // =========== Join existing room ==============
  function joinRoom(e){
    const room = e.target.value;
    if (room === currentRoom){
      return;
    }

    // If user is already in a room, leave this room before joining a new one
    if (currentRoom) {
      socket.emit("leave", currentRoom);
    }
    updateCurrentRoom(room);
    socket.emit("join", room);
  }

  // Upgrade account to Premium
  function upgradeToPremium(){
    // Connect and send purchase data to the purchase server
    // This emit would be coming from the purchase server
    socket.emit("upgrade_to_premium", user, function(response){
      if (response.status === 200){
        const accountToCapitalized = capitalize(response.accountType);
        updateUserStatus(accountToCapitalized);
      }
    });
  }

  // =========== Someone is typing ==============
  function timeoutFunction(){
    updateTyping(false);
    socket.emit("stopped_typing", currentRoom);
  }

  function onKeyDownNotEnter(){
    if(!typing) {
      updateTyping(true);
      socket.emit("typing", currentRoom);
      updateTimeout(setTimeout(timeoutFunction, 5000));
    } else {
      clearTimeout(timeout);
      updateTimeout(setTimeout(timeoutFunction, 5000));
    }
  }

  // =========== Send message to current room ==============
  function sendMessage(e){
    e.preventDefault();

    const name = messageInput.current.name;
    const message = {
      username: user,
      message: userInput.new_message
    }
    socket.emit('new_message', {room: currentRoom, data: message});
    updateUserInput({[name]: ""});
    updateData(data => [...data, message]);
  }

  // ========== Delete room (Only admins and owners can do this) ==============
  function deleteRoom(room){
    if (deleteConfirmation){
      updateDeleteConfirmation(false);
    }

    socket.emit("delete_room", {room: room, username: user}, function(response){
      console.log(response);
      if (response.status === 204){
        updateCurrentRoom("");
        updateData([]);
        updateRoomClients([]);
      }
    });
  }

  function leaveRoomCheck(){
    if (roomClients.length < 2){
      for (let client of roomClients) {
        let username = client.username.substring(1);
        if (username === user || client.username === user){
          updateDeleteConfirmation(true);
        }
      }
    } else {
      leaveRoom(currentRoom);
    }
  }

  // ========== Leave room ==============
  function leaveRoom(room){
    socket.emit("leave", room);
    updateCurrentRoom("");
    updateData([]);
    updateRoomClients([]);
  }

  // ========== Create new user ==============
  function createUser(e){
    e.preventDefault();
    let user = userInput.user;

    if (!user){
      user = "Anonymous" + Date.now();
    }

    socket.emit("new_user", user, function(response){
      console.log(response);
      if (!response.unique){
        updateUserExists(true);
        return;
      }

      if(userExists) {
        updateUserExists(false);
      }
      const accountToCapitalized = capitalize(response.accountType);
      updateUserStatus(accountToCapitalized);
    });
    updateUser(user);
  }

  function capitalize(str){
    const capitalized = str.charAt(0).toUpperCase() + str.substring(1);
    return capitalized;
  }

  // ========== Create new room ==============
  function createNewRoom(e){
    e.preventDefault();
    const room = userInput.createRoom;

    for (let roomObject of activeRooms) {
      if (roomObject.name === room) {
        updateRoomExists(true);
        break;
      }
    }

    const data = {
      room: room,
      username: user,
    }

    socket.emit("create_room", data, function(response){
      console.log(response);
      if (!response.unique){
        updateRoomExists(true);
        return;
      }

      if(roomExists) {
        updateRoomExists(false);
      }
      updateCurrentRoom(room);
    });
  }

  function emptyDB(){
    socket.emit("empty_db", "please");
  }

  return (
    <div className="App">
      <div className="chatTools">
        <h2>Welcome {user}!</h2>
        <h4>Room: {currentRoom ? currentRoom : "Not connected to a room"}</h4>
        <p>Account type: {userStatus}</p>
        <button onClick={upgradeToPremium}>BUY PREMIUM</button>
        {userExists && <p className="usernameTaken">Username is already taken</p>}
        {activeRooms.map((room) => {
          id++;
          return(
            <div key={id}>
              <button onClick={joinRoom} value={room.name}>Join {room.name}</button>
              <button onClick={() => deleteRoom(room.name)}>Delete {room.name}</button>
            </div>
          );
        })}
        <form onSubmit={sendMessage}>
          <input type="text" ref={messageInput} name="new_message" onChange={onChange} value={userInput.new_message} />
          <button type="submit">Send Message To {currentRoom}</button>
        </form>
        <button onClick={leaveRoomCheck}>Leave current room</button><button onClick={emptyDB}>Empty DATABASE</button>        
        {deleteConfirmation && <Popup currentRoom={currentRoom} updateDeleteConfirmation={updateDeleteConfirmation} deleteRoom={deleteRoom} />}
        <form onSubmit={createNewRoom}>
          <input type="text" name="createRoom" onChange={onChange} value={userInput.createRoom} />
          <button type="submit">Create Room</button>
        </form>
        <form onSubmit={createUser}>
          <input type="text" name="user" onChange={onChange} value={userInput.user} placeholder={"Blank for anonymous"} />
          <button type="submit">Create User</button>
        </form>
        {roomExists && <p>Room already exists, try another name</p> }
        <div className="appInfo">
          <h3> App info </h3>
          <p className="appInfotext">Basic users can only create temporary rooms.
          This room will be deleted once the last user leaves the room, no matter who created it.
          All rooms must have a unique name, invalid names also include rooms that previously has been deleted.
          Though only the creator/owner can delete a room with other users present.
          </p>
          <p>
          Premium users can create premium rooms that are knighted with a friendly Chatbot,
          this bot will forward all server notices to the users of the room.
          The Chatbot will also keep the room active even if no humans are present in the room.
          </p>
          <p>
          Premium rooms will also be saved and can thus survive server rebooteths.
          Only an admin or the creator/owner can delete this room.
          Purchase a premium account by first creating a basic user.
          </p>
          <p>
          Admins can login by creating a user called Admin_1 and Admin_2.
          </p>
        </div>
      </div>
      <div className="userList">
      {roomClients.map((client) => {
        id++;
        return(
          <p className="clientUsername" key={id}>{client.username}</p>
        );
      })}
      </div>
      <div className="chatTable">
      {data.map((message) => {
        id++;
        let usernameWithColon = message.username + ":"
        return (
          <div className="message" key={id}>
            <p className="message__username">{usernameWithColon}</p>
            <p className="message__message">{message.message}</p>
          </div>
        );
      })}
      {isTyping && <p className="typing">Someone is typing...</p>}
      </div>
    </div>
  );
}

function Popup(props){
  const room = props.currentRoom;
  return(
    <div>
      <p>Leaving the room empty will delete it, are you sure?</p>
      <button onClick={() => props.deleteRoom(room)}>YES</button>
      <button onClick={() => props.updateDeleteConfirmation(false)}>NO</button>
    </div>
  );
}
