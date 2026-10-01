public enum Unit {
  CENTIMETRE(1),
  INCH(3);

  final int factor;

  Unit(int factor) {
    this.factor = factor;
  }
}
