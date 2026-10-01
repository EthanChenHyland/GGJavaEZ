package orders.pricing;

import orders.inventory.Stock;

public class PriceEngine {
  private final Stock stock;

  public PriceEngine(Stock stock) {
    this.stock = stock;
  }

  public int quote(String item, int quantity) {
    int unitCents = item.length() * 700;
    int reserved = stock.reserve(item, quantity);
    return unitCents * reserved;
  }
}
