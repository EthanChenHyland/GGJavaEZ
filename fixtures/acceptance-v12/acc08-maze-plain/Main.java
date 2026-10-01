public class Main {
  public static void main(String[] args) {
    String[] plan = {
      "S.#.......",
      ".##.#####.",
      "....#...#.",
      "###.#.#.#.",
      "#...#.#.#.",
      "#.###.#.#.",
      "#.....#...",
      "#######.##",
      "#.........",
      "#########E",
    };
    MazeSolver solver = new MazeSolver(plan);
    boolean solved = solver.explore(0, 0, 1);
    System.out.println("SOLVED " + solved);
    System.out.println("DEEPEST " + solver.deepest);
    System.out.println("BACKTRACKS " + solver.backtracks);
  }
}

class MazeSolver {
  final char[][] cells;
  int deepest;
  int backtracks;

  MazeSolver(String[] plan) {
    cells = new char[plan.length][];
    for (int row = 0; row < plan.length; row++) cells[row] = plan[row].toCharArray();
  }

  boolean explore(int row, int column, int depth) {
    if (row < 0 || column < 0 || row >= cells.length || column >= cells[row].length) return false;
    char here = cells[row][column];
    if (here == '#' || here == '+') return false;
    if (depth > deepest) deepest = depth;
    if (here == 'E') return true;
    cells[row][column] = '+';
    if (explore(row, column + 1, depth + 1)) return true;
    if (explore(row + 1, column, depth + 1)) return true;
    if (explore(row, column - 1, depth + 1)) return true;
    if (explore(row - 1, column, depth + 1)) return true;
    cells[row][column] = '.';
    backtracks = backtracks + 1;
    return false;
  }
}
