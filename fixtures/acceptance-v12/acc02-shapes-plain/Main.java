public class Main {
  static int measure(Shape figure) {
    return figure.area();
  }

  public static void main(String[] args) {
    Rectangle banner = new Rectangle(new Dimensions(6, 2), Unit.CENTIMETRE);
    Square tile = new Square(3, Unit.INCH);
    int bannerArea = measure(banner);
    int tileArea = measure(tile);
    String label = tile.describe();
    System.out.println("AREAS " + bannerArea + " " + tileArea);
    System.out.println("LABEL " + label);
    System.out.println("FACTOR " + tile.unit.factor);
  }
}
