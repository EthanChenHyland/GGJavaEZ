import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    Playlist mix = new Playlist();
    mix.enqueue(new Track("Harbour Lights", 214));
    mix.enqueue(new Track("Paper Kites", 187));
    mix.enqueue(new Track("Slow Orbit", 301));
    mix.enqueue(new Track("Tin Roof", 158));
    mix.dropLongerThan(300);
    mix.orderByLength();
    int listened = mix.playAll();
    System.out.println("TRACKS " + mix.trackCount());
    System.out.println("LISTENED " + listened);
  }
}

class Playlist {
  final List<Track> queue = new ArrayList<>();

  void enqueue(Track track) {
    queue.add(track);
  }

  void dropLongerThan(int limitSeconds) {
    queue.removeIf(candidate -> candidate.seconds > limitSeconds);
  }

  void orderByLength() {
    queue.sort((left, right) -> left.seconds - right.seconds);
  }

  int playAll() {
    int total = 0;
    for (Track track : queue) total = total + track.play();
    return total;
  }

  int trackCount() {
    return queue.size();
  }
}

class Track {
  final String title;
  final int seconds;
  int playCount;

  Track(String title, int seconds) {
    this.title = title;
    this.seconds = seconds;
  }

  int play() {
    playCount = playCount + 1;
    return seconds;
  }
}
