public class CallLandscape {
  static int left(int depth) { return depth==0?1:1+right(depth-1); }
  static int right(int depth) { return depth==0?1:1+left(depth-1); }
  static int branch(int depth) { return depth==0?1:branch(depth-1)+branch(depth-1); }
  public static void main(String[] args) {
    int deep=left(220);
    int wide=0; for(int i=0;i<20;i++) wide+=branch(3);
    System.out.println("CALL_LANDSCAPE " + wide + " " + deep);
  }
}
