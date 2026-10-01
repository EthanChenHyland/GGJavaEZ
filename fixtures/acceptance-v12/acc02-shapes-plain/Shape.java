public abstract class Shape {
  final Unit unit;
  int describeCalls;

  protected Shape(Unit unit) {
    this.unit = unit;
  }

  abstract int area();

  String describe() {
    describeCalls = describeCalls + 1;
    return "shape";
  }
}
