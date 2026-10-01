public class Main {
  public static void main(String[] args) {
    Simulation simulation = new Simulation(12);
    simulation.seedArrivals(400);
    simulation.runUntilIdle();
    System.out.println("PROCESSED " + simulation.processed);
    System.out.println("MAX_QUEUE " + simulation.maxQueueDepth);
    System.out.println("CLOCK " + simulation.clock);
  }
}

class Simulation {
  final EventHeap agenda = new EventHeap(4096);
  final Counter[] counters;
  int clock;
  int processed;
  int maxQueueDepth;
  int randomState = 17;

  Simulation(int counterCount) {
    counters = new Counter[counterCount];
    for (int index = 0; index < counterCount; index++) counters[index] = new Counter(index);
  }

  int nextRandom(int bound) {
    randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
    return randomState % bound;
  }

  void seedArrivals(int customers) {
    for (int customer = 0; customer < customers; customer++) {
      agenda.push(nextRandom(5000), customer, 0);
    }
  }

  void runUntilIdle() {
    while (agenda.size > 0) {
      int time = agenda.peekTime();
      int customer = agenda.peekCustomer();
      int stage = agenda.peekStage();
      agenda.pop();
      clock = time;
      handle(customer, stage);
      processed = processed + 1;
      if (agenda.size > maxQueueDepth) maxQueueDepth = agenda.size;
    }
  }

  void handle(int customer, int stage) {
    Counter counter = counters[customer % counters.length];
    int serviceTime = counter.serve(stage, nextRandom(40));
    if (stage < 5) agenda.push(clock + serviceTime, customer, stage + 1);
  }
}

class Counter {
  final int counterNumber;
  int served;
  int busyTime;

  Counter(int counterNumber) {
    this.counterNumber = counterNumber;
  }

  int serve(int stage, int jitter) {
    served = served + 1;
    int duration = 10 + stage * 3 + jitter;
    busyTime = busyTime + duration;
    return duration;
  }
}

class EventHeap {
  final int[] times;
  final int[] customers;
  final int[] stages;
  int size;

  EventHeap(int capacity) {
    times = new int[capacity];
    customers = new int[capacity];
    stages = new int[capacity];
  }

  void push(int time, int customer, int stage) {
    int slot = size;
    size = size + 1;
    times[slot] = time;
    customers[slot] = customer;
    stages[slot] = stage;
    while (slot > 0) {
      int parent = (slot - 1) / 2;
      if (!earlier(slot, parent)) break;
      exchange(slot, parent);
      slot = parent;
    }
  }

  int peekTime() { return times[0]; }
  int peekCustomer() { return customers[0]; }
  int peekStage() { return stages[0]; }

  void pop() {
    size = size - 1;
    exchange(0, size);
    int slot = 0;
    while (true) {
      int left = slot * 2 + 1;
      int right = left + 1;
      int best = slot;
      if (left < size && earlier(left, best)) best = left;
      if (right < size && earlier(right, best)) best = right;
      if (best == slot) break;
      exchange(slot, best);
      slot = best;
    }
  }

  boolean earlier(int first, int second) {
    if (times[first] != times[second]) return times[first] < times[second];
    return customers[first] < customers[second];
  }

  void exchange(int first, int second) {
    int time = times[first]; times[first] = times[second]; times[second] = time;
    int customer = customers[first]; customers[first] = customers[second]; customers[second] = customer;
    int stage = stages[first]; stages[first] = stages[second]; stages[second] = stage;
  }
}
