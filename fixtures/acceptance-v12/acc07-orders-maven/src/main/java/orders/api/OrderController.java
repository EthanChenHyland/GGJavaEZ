package orders.api;

import orders.audit.AuditLog;
import orders.inventory.Stock;
import orders.persistence.OrderRepository;
import orders.pricing.PriceEngine;
import orders.service.OrderService;

public class OrderController {
  private final OrderService service;
  private final AuditLog log;

  private OrderController(OrderService service, AuditLog log) {
    this.service = service;
    this.log = log;
  }

  public static OrderController assemble() {
    AuditLog log = new AuditLog();
    OrderRepository repository = new OrderRepository(log);
    Stock stock = new Stock(repository, 5);
    PriceEngine engine = new PriceEngine(stock);
    return new OrderController(new OrderService(engine), log);
  }

  public int submit(String item, int quantity) {
    return service.place(item, quantity);
  }

  public int auditedEntries() {
    return log.entryCount();
  }
}
