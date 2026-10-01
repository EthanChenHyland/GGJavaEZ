public class Main {
  public static void main(String[] args) {
    Network network = Network.generate(3000, 4, 7);
    int[] degrees = network.degreesFrom(0);
    int reachable = 0;
    int farthest = 0;
    for (int distance : degrees) {
      if (distance >= 0) reachable = reachable + 1;
      if (distance > farthest) farthest = distance;
    }
    System.out.println("MEMBERS " + network.memberCount);
    System.out.println("FOLLOWS " + network.followCount);
    System.out.println("REACHABLE " + reachable);
    System.out.println("FARTHEST " + farthest);
  }
}

class Member {
  final int memberNumber;
  Follow firstFollow;
  Member nextMember;

  Member(int memberNumber) {
    this.memberNumber = memberNumber;
  }

  void follow(Member other) {
    Follow link = new Follow(other, firstFollow);
    firstFollow = link;
  }
}

class Follow {
  final Member target;
  final Follow nextFollow;

  Follow(Member target, Follow nextFollow) {
    this.target = target;
    this.nextFollow = nextFollow;
  }
}

class Network {
  Member[] byNumber;
  int memberCount;
  int followCount;

  static Network generate(int members, int followsEach, int seed) {
    Network network = new Network();
    network.byNumber = new Member[members];
    for (int number = 0; number < members; number++) {
      network.byNumber[number] = new Member(number);
      network.memberCount = network.memberCount + 1;
    }
    int state = seed;
    for (int number = 0; number < members; number++) {
      for (int edge = 0; edge < followsEach; edge++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        int other = state % members;
        network.byNumber[number].follow(network.byNumber[other]);
        network.followCount = network.followCount + 1;
      }
    }
    return network;
  }

  int[] degreesFrom(int start) {
    int[] distance = new int[memberCount];
    for (int index = 0; index < distance.length; index++) distance[index] = -1;
    int[] queue = new int[memberCount];
    int head = 0;
    int tail = 0;
    distance[start] = 0;
    queue[tail] = start;
    tail = tail + 1;
    while (head < tail) {
      int current = queue[head];
      head = head + 1;
      for (Follow link = byNumber[current].firstFollow; link != null; link = link.nextFollow) {
        int next = link.target.memberNumber;
        if (distance[next] < 0) {
          distance[next] = distance[current] + 1;
          queue[tail] = next;
          tail = tail + 1;
        }
      }
    }
    return distance;
  }
}
