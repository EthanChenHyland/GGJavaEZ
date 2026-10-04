package dispatch.service;
import dispatch.domain.*;import java.util.*;
public final class Dispatch {
 public static int sent;
 public final ArrayList<Shipment> accepted=new ArrayList<>();
 public final HashMap<String,Shipment> byLabel=new HashMap<>();
 public final Queue<Shipment> pending=new ArrayDeque<>();
 private final Pricing pricing;
 public Dispatch(Pricing pricing){this.pricing=pricing;}
 public void enqueue(Shipment shipment){pending.offer(shipment);}
 public int drain(){int total=0;while(!pending.isEmpty()){Shipment shipment=pending.poll();int cost=pricing.quoted(shipment);accepted.add(shipment);byLabel.put(shipment.label(),shipment);sent++;total+=cost;}return total;}
 public void mark(Shipment shipment){if(byLabel.get(shipment.label())!=shipment)throw new IllegalStateException("alias lost");}
}
