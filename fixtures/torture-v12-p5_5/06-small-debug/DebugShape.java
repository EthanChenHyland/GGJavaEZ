public class DebugShape {
  static class Cell { int value; Cell(int value) { this.value=value; } void update(int next) { value=next; } }
  static int descend(int depth, Cell cell) { if(depth==0) { cell.update(18); return cell.value; } return descend(depth-1,cell); }
  public static void main(String[] args) {
    Cell shared=new Cell(0);
    Cell[] aliases={shared,shared};
    int result=descend(4,shared);
    System.out.println("DEBUG_SHAPE " + result + " " + (aliases[0]==aliases[1]));
  }
}
