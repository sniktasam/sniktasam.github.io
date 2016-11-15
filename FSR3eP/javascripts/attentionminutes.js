
/* global $, _, Bacon, YT */
function merge(stream1, stream2) {
  return stream1.merge(stream2);
}

function eventStream(eventName) {
  return $(window).asEventStream(eventName);
}

// A map to player state codes from their human-readable sting equivalents.
// https://developers.google.com/youtube/js_api_reference
var PLAYER_CODES = {
  beginning: -1,
  completed: 0,
  play: 1,
  pause: 2,
  buffer: 3,
  video: 5
};

var DECAY = 5000; // milliseconds
var EVENT_NAMES = ["focus", "click", "scroll", "mousemove", "touchstart", "touchend", "touchcancel", "touchleave", "touchmove"];

var playerEventStream = new Bacon.Bus();

var isPlaying = playerEventStream
    .scan({}, function(states, event) {
      var update = {};
      var id = event.target.getIframe().id;
      update[id] = event.data;
      return _.assign(states, update);
    })
    .map(_.values)
    .map(_.partialRight(_.contains, PLAYER_CODES.play));

var playerEvents = function(id) {
  var events = new Bacon.Bus();
  var player = new YT.Player(id, {
    events: {
      'onStateChange': function(event) {
        playerEventStream.push(event);
      }
    }
  });
  return events;
};

var isFocused = eventStream("focus").map(true)
    .merge(eventStream("blur").map(false))
    .toProperty(true);

var streams = _.map(EVENT_NAMES, eventStream);
var interactionStream = _.reduce(streams, merge);
var activityStream = interactionStream.merge(playerEventStream);

var recentlyActive = activityStream
    .map(true)
    .merge(Bacon.once(true))
    .flatMapLatest(function() {
      return Bacon.once(true).merge(Bacon.once(false).delay(DECAY));
    })
    .toProperty(false);

var isActive = (recentlyActive.and(isFocused)).or(isPlaying);

var secondsActive = Bacon.mergeAll(isActive.changes(), isActive.sample(1000))
  .map(function(isActive) {
    return {
      isActive: isActive,
      timestamp: new Date().getTime()
    };
  })
  .slidingWindow(2,2)
  .filter(function(span) { return span[0].isActive; })
  .map(function(span) { return span[1].timestamp - span[0].timestamp; })
  .scan(0, function(x,y) { return x + y;})
  .map(function(x) { return x / 1000; }) // milliseconds
  .map(Math.floor);

secondsActive.sample(2000)
  .merge(Bacon.once(0))
  .slidingWindow(2,2)
  .map(function(diff) { return diff[1] - diff[0]; })
  .filter(function(x) { return x > 0; })
  .log("sent");

function onYouTubePlayerAPIReady() {
  _(["jxihEYDBQgY"]).forEach(function(id) {
    playerEventStream.plug(playerEvents(id));
  });
}

$(function() {
  secondsActive.assign($("#seconds"), "text");
  isActive.map(function(x) { return x ? "label label-success" : "label label-danger"; }).assign ($("#label"), "attr", "class");
  isActive.map(function(x) { return x ? "Attention" : "Idle"; }).assign ($("#label"), "text");
});
