public class Rectangle extends Polygon {
  final Dimensions extent;

  Rectangle(Dimensions extent, Unit unit) {
    super(4, unit);
    this.extent = extent;
  }

  @Override
  int area() {
    return extent.width() * extent.height();
  }

  @Override
  String describe() {
    return super.describe() + "/rectangle";
  }
}
