package dispatch.service;
import dispatch.domain.Shipment;
public interface Pricing {
 int cost(Shipment shipment);
 default int quoted(Shipment shipment){return cost(shipment);}
}
