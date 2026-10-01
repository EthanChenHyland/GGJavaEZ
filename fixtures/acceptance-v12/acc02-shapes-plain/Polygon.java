public class Polygon extends Shape {
  final int sideCount;

  Polygon(int sideCount, Unit unit) {
    super(unit);
    this.sideCount = sideCount;
  }

  @Override
  int area() {
    return 0;
  }

  @Override
  String describe() {
    String parent = super.describe();
    return parent + "/polygon" + sideCount;
  }
}
