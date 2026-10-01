public class Square extends Rectangle {
  final int edge;

  Square(int edge, Unit unit) {
    super(new Dimensions(edge, edge), unit);
    this.edge = edge;
  }

  @Override
  int area() {
    int inner = super.area();
    return inner;
  }

  @Override
  String describe() {
    return super.describe() + "/square";
  }
}
