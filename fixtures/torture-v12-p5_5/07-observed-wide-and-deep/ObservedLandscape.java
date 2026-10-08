public class ObservedLandscape {
  static int depth(int remaining) { return remaining == 0 ? 0 : 1 + depth(remaining - 1); }
  static int leaf(int seed) { return seed; }
  static int branch(int seed) { return leaf(seed) + leaf(seed + 1); }
  public static void main(String[] args) {
    int descent = depth(70);
    int breadth = 0;
    for (int i = 0; i < 30; i++) breadth += branch(i);
    System.out.println("OBSERVED_LANDSCAPE " + breadth + " " + descent);
  }
}
