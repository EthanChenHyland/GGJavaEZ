public class QuietTiny {
  static int quiet(int a) { return a + 1; }
  public static void main(String[] args) { int answer = quiet(17); if (answer != 18) throw new AssertionError(answer); }
}
