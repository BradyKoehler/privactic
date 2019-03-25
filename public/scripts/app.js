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
        box.append(`<div class="message ${data[i].me ? 'me' : 'you'}"><p>${data[i].content}</p></div>`);
      }
      $("#app-conversation-content").animate({ scrollTop: $("#app-conversation-content").height() }, "fast");
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
      $("div#app-conversation-content").append(`<div class="message me"><p>${data.content}</p></div>`);
      $("#app-conversation-content").animate({ scrollTop: $("#app-conversation-content").height() }, "fast");
    });
  });
});
