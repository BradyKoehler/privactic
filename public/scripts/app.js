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

function conversationsLoad() {
  $.get('/conversations', function(data) {
    var list = $("ul#conversations-list");
    for (var i = 0; i < data.length; i++) {
      list.append(`<a href="#" class="list-group-item list-group-item-action" data-id="${data[i].conversation_id}">${data[i].username}</a>`);
    }
  });
}

var messages = $("div#app-conversation-content");
function addMessage(msg, me = false) {
  messages.append(`<div class="message ${msg.me || me ? 'me' : 'you'}"><p>${msg.content}</p></div>`);
  $("#app-conversation-content").scrollTop($("#app-conversation-content").prop("scrollHeight"));
}

const SOCKET_IO_URL = $("meta[name=socket_io_url]").attr("content");
var socket = io.connect(SOCKET_IO_URL);
socket.on('message', function(data) {
  if ($("div#app-conversation").data("id") == data.conversation_id) {
    addMessage(data);
  }
});

$(function() {
  conversationsLoad();

  $(document).on('click', 'ul#conversations-list a', function() {
    var id = $(this).data('id');
    $("div#app-conversation").data("id", id);
    $("div#app-conversation-header h3").html($(this).text());
    $.get('/conversation/' + id, function(data) {
      var box = $("div#app-conversation-content");
      box.html("");
      for (var i = 0; i < data.length; i++) {
        addMessage(data[i]);
      }
    });
  });

  $("button#message-send").click(function() {
    var textarea = $("textarea#message-content");
    var conversation_id = $("div#app-conversation").data("id");
    $.post('/messages', {
      conversation_id: conversation_id,
      content: textarea.val()
    }, function(data) {
      textarea.val("");
      addMessage(data, true);
    });
  });
});
