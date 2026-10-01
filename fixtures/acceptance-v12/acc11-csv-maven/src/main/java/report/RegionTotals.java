package report;

public class RegionTotals {
  final Bucket north = new Bucket();
  final Bucket south = new Bucket();
  final Bucket other = new Bucket();
  int rowsSeen;

  void accumulate(String region, int value) {
    rowsSeen = rowsSeen + 1;
    Bucket target = bucketFor(region);
    target.addAmount(value);
  }

  Bucket bucketFor(String region) {
    if (region.equals("north")) return north;
    if (region.equals("south")) return south;
    return other;
  }
}

class Bucket {
  int amount;
  int entries;

  void addAmount(int value) {
    amount = amount + value;
    entries = entries + 1;
  }
}
