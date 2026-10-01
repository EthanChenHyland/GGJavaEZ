public class Seat {
  final char rowLetter;
  final int columnNumber;
  String occupant;
  double priceSold;

  Seat(char rowLetter, int columnNumber) {
    this.rowLetter = rowLetter;
    this.columnNumber = columnNumber;
  }

  void reserveFor(String guest, double price) {
    occupant = guest;
    priceSold = price;
  }
}
