package dispatch.service;
import dispatch.domain.Shipment;
public final class RushPricing extends BasePricing {
 public RushPricing(int rate){super(rate);}
 public int cost(Shipment shipment){if(shipment.quantity()<0)throw new IllegalArgumentException("negative shipment");return shipment.quantity()*rate;}
}
