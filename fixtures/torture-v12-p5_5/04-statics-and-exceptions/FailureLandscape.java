public class FailureLandscape {
  static class First { static int value=7; }
  static class Second { static int value=First.value+5; }
  static class Third { static int value=Second.value+3; }
  static int cleaned=0;
  static void bottom() { throw new IllegalArgumentException("nested root cause 🟣"); }
  static void middle() { try { bottom(); } catch(IllegalArgumentException failure) { throw new IllegalStateException("wrapped cause",failure); } finally { cleaned++; } }
  static void top() { try { middle(); } catch(IllegalStateException failure) { throw failure; } }
  public static void main(String[] args) {
    int observed=Third.value; for(int i=0;i<4;i++) { try { top(); } catch(IllegalStateException failure) { System.err.println("CAUGHT " + i); } }
    System.out.println("STATIC_FAILURE " + observed + " " + cleaned);
    top();
  }
}
