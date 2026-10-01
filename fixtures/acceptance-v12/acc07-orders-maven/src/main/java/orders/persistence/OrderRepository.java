package orders.persistence;

import orders.audit.AuditLog;

public class OrderRepository {
  private final AuditLog log;
  private int storedRows;

  public OrderRepository(AuditLog log) {
    this.log = log;
  }

  public void save(String item, int quantity) {
    storedRows = storedRows + 1;
    log.record(item, quantity);
  }
}
