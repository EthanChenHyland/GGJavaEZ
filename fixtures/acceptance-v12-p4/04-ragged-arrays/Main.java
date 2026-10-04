public class Main {
 public static void main(String[] args){int[][] grid=new int[3][];int[] shortRow=new int[2];int[] longRow=new int[8];grid[0]=shortRow;grid[1]=longRow;grid[2]=null;longRow[7]=91;int[][] rectangular=new int[2][3];rectangular[1][2]=12;int[][][] cube=new int[1][][];cube[0]=grid;System.out.println(grid[0].length+":"+grid[1].length+":"+(grid[2]==null)+":"+cube[0][1][7]+":"+rectangular[1][2]);}
}
