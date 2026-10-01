package orders.service;

import orders.pricing.PriceEngine;

public class OrderService {
  private final PriceEngine engine;
  private int placedOrders;

  public OrderService(PriceEngine engine) {
    this.engine = engine;
  }

  public int place(String item, int quantity) {
    int quoted = engine.quote(item, quantity);
    placedOrders = placedOrders + 1;
    return quoted;
  }
}
