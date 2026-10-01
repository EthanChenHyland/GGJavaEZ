package orders.inventory;

import orders.persistence.OrderRepository;

public class Stock {
  private final OrderRepository repository;
  private int unitsOnHand;

  public Stock(OrderRepository repository, int unitsOnHand) {
    this.repository = repository;
    this.unitsOnHand = unitsOnHand;
  }

  public int reserve(String item, int quantity) {
    int granted = Math.min(quantity, unitsOnHand);
    unitsOnHand = unitsOnHand - granted;
    repository.save(item, granted);
    return granted;
  }
}
