let Privactic = {
  _conversations: [],
  setConversations: function(conversations) {
    this._conversations = conversations;
  }
};

function conversationNew() {
  $.get('/users', function(data) {
    var select = $("select#conversationNewUser");
    select.html("");
    for(var i = 0; i < data.length; i++) {
      select.append(`<option value="${data[i].id}">${data[i].username}</option>`);
    }
  });
}

function conversationCreate() {
  var id = $("select#conversationNewUser").val();
  $.post('/conversations', { id: id }, function(data) {
    $("ul#conversations-list").append(`<li class="list-group-item" data-id="${data.conversation_id}">${data.username}</li>`);
    $("#conversation-new").modal("hide");
  });
}

let conversations = [];
var ring = new kbpgp.keyring.KeyRing;

function conversationsLoad() {
  $.get('/conversations', function(data) {
    conversations = data;
    var list = $("ul#conversations-list");
    for (var i = 0; i < data.length; i++) {
      kbpgp.KeyManager.import_from_armored_pgp({
        armored: data[i].public
      }, function(err, user) {
        if (!err) {
          conversations.filter(x => x.conversation_id == data[i].conversation_id)[0].user = user;
          ring.add_key_manager(user);
          console.log("user " + data[i].username + " is loaded");
        }
      });

      var node = document.createElement("A");
      node.setAttribute("href", "#");
      node.setAttribute("class", "list-group-item list-group-item-action");
      node.setAttribute("data-id", data[i].conversation_id);
      var textnode = document.createTextNode(data[i].username);
      node.appendChild(textnode);

      list.append(node);

      conversations[i].node = node;

      // list.append(`<a href="#" class="list-group-item list-group-item-action" data-id="${data[i].conversation_id}">${data[i].username}</a>`);
    }
    Privactic.setConversations(conversations);
  });
}

var messages = $("div#app-conversation-content");
function addMessage(msg, me = false) {
  // messages.append(`<div class="message ${msg.me || me ? 'me' : 'you'}"><p>${msg.content}</p></div>`);
  msg.node.setAttribute("class", `message ${msg.me || me ? 'me' : 'you'}`);
  msg.node.innerHTML = msg.decrypted;
  $("#app-conversation-content").scrollTop($("#app-conversation-content").prop("scrollHeight"));
}

const SOCKET_IO_URL = $("meta[name=socket_io_url]").attr("content");
var socket = io.connect(SOCKET_IO_URL);
socket.on('message', function(data) {
  if ($("div#app-conversation").data("id") == data.conversation_id) {
    // console.log(data);
    kbpgp.unbox({keyfetch: ring, armored: data.content }, function(err, literals) {
      if (err != null) {
        return console.log("Problem: " + err);
      } else {
        // console.log("decrypted message");
        // console.log(literals[0].toString());
        data.node = document.createElement("DIV");
        messages.append(data.node);
        data.decrypted = literals[0].toString();
        addMessage(data);
        // addMessage({content: literals[0].toString()});
        // var ds = km = null;
        // ds = literals[0].get_data_signer();
        // if (ds) { km = ds.get_key_manager(); }
        // if (km) {
        //   console.log("Signed by PGP fingerprint");
        //   console.log(km.get_pgp_fingerprint().toString('hex'));
        // }
      }
    });

    // addMessage(data);
  }
});

let keys;

function getKeyData() {
  $.get('/keys', function(data) {
    kbpgp.KeyManager.import_from_armored_pgp({
      armored: data.public
    }, function(err, user) {
      if (!err) {
        user.merge_pgp_private({
          armored: data.private
        }, function(err) {
          if (!err) {
            // should always be true
            if (user.is_pgp_locked()) {

              var password = prompt("Private Key Password:");

              user.unlock_pgp({
                passphrase: password
              }, function(err) {
                if (!err) {
                  keys = user;
                  ring.add_key_manager(user);

                  console.log("Loaded private key with passphrase");

                  conversationsLoad();
                }
              });
            } else {
              console.log("Loaded private key w/o passphrase");
            }
          }
        });
      }
    });
  });
}

function messageCreate(data) {
  if (data.sender && data.recipient) {
    $.post('/messages', data, function(data) {
      $("textarea#message-content").val("");
      // console.log(data);
      kbpgp.unbox({keyfetch: ring, armored: data.content }, function(err, literals) {
        if (err != null) {
          return console.log("Problem: " + err);
        } else {
          data.node = document.createElement("DIV");
          messages.append(data.node);
          data.decrypted = literals[0].toString();
          addMessage(data, true);
          // console.log("decrypted message");
          // console.log(literals[0].toString());
          // var ds = km = null;
          // ds = literals[0].get_data_signer();
          // if (ds) { km = ds.get_key_manager(); }
          // if (km) {
          //   console.log("Signed by PGP fingerprint");
          //   console.log(km.get_pgp_fingerprint().toString('hex'));
          // }
        }
      });
    });
  }
}

function decryptMessage(msg) {
  kbpgp.unbox({keyfetch: ring, armored: msg.content }, function(err, literals) {
    if (err != null) {
      return console.log("Problem: " + err);
    } else {
      msg.decrypted = literals[0].toString();
      addMessage(msg);
    }
  });
}

$(function() {
  getKeyData();

  $(document).on('click', 'ul#conversations-list a', function() {
    var id = $(this).data('id');
    $("div#app-conversation").data("id", id);
    $("div#app-conversation-header h3").html($(this).text());
    $.get('/conversation/' + id, function(data) {
      var box = $("div#app-conversation-content");
      box.html("");
      var conversation = Privactic._conversations.filter(x => x.conversation_id == id)[0];
      conversation.messages = data;
      for (var i = 0; i < conversation.messages.length; i++) {
        conversation.messages[i].node = document.createElement("DIV");
        messages.append(conversation.messages[i].node);
        decryptMessage(conversation.messages[i]);

        // var me = conversation.messages[i].me;
        // kbpgp.unbox({keyfetch: ring, armored: conversation.messages[i].content }, function(err, literals) {
        //   if (err != null) {
        //     return console.log("Problem: " + err);
        //   } else {
        //     addMessage({content: literals[0].toString(), me: me});
        //   }
        // });
      }
    });
  });

  $("button#message-send").click(function() {
    var conversation_id = $("div#app-conversation").data("id");
    var message = $("textarea#message-content").val();

    var encrypted = {
      conversation_id: conversation_id,
      sender: null,
      recipient: null
    };

    // Encrypt for sender
    kbpgp.box ({
      msg: message,
      encrypt_for: keys,
      sign_with: keys
    }, function(err, result_string, result_buffer) {
      encrypted.sender = result_string;
      console.log(err, result_string, result_buffer);
      messageCreate(encrypted);
    });

    // Encrypt for recipient
    kbpgp.box ({
      msg: message,
      encrypt_for: conversations.filter(x => x.conversation_id == conversation_id)[0].user,
      sign_with: keys
    }, function(err, result_string, result_buffer) {
      encrypted.recipient = result_string;
      console.log(err, result_string, result_buffer);
      messageCreate(encrypted);
    });
  });
});
