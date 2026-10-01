public class Main {
  public static void main(String[] args) {
    String[] guestNames = { "Rin", "Oto", "Vale" };
    double[] tierPrices = { 12.5, 18.0, 30.25 };
    char[] rowLabels = { 'A', 'B', 'C' };
    long[] ticketIds = { 9007199254740993L, 9007199254740995L, 42L };
    int[] reservedPerRow = new int[3];
    long largestTicket = ticketIds[0];
    Seat[][] grid = new Seat[3][4];
    for (int row = 0; row < grid.length; row++) {
      for (int column = 0; column < grid[row].length; column++) {
        grid[row][column] = new Seat(rowLabels[row], column);
      }
    }
    for (int guest = 0; guest < guestNames.length; guest++) {
      Seat chosen = grid[guest][guest + 1];
      chosen.reserveFor(guestNames[guest], tierPrices[guest]);
      reservedPerRow[guest] = reservedPerRow[guest] + 1;
    }
    double revenue = 0;
    for (Seat[] seatRow : grid) {
      for (Seat seat : seatRow) revenue = revenue + seat.priceSold;
    }
    System.out.println("REVENUE " + revenue);
    System.out.println("LARGEST " + largestTicket);
    System.out.println("ROWS " + reservedPerRow[0] + reservedPerRow[1] + reservedPerRow[2]);
  }
}
