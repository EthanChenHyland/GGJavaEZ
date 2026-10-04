package dispatch.app;
import dispatch.domain.*;import dispatch.service.*;import java.util.*;import java.nio.file.*;import java.nio.charset.StandardCharsets;import org.apache.commons.lang3.StringUtils;
public class Main {
 public static void main(String[] args)throws Exception{
  Scanner input=new Scanner(System.in);int quantity=input.nextInt();Pricing pricing=new RushPricing(5);Dispatch dispatch=new Dispatch(pricing);
  Shipment first=new Shipment(StringUtils.capitalize("harbor"),quantity);Shipment second=new Shipment("Inland",2);Shipment[] cargo={first,second,null};Shipment[] alias=cargo;
  int[][] capacities=new int[3][];capacities[0]=new int[]{quantity,2};capacities[1]=new int[1];capacities[2]=null;
  ArrayList<Shipment> batch=new ArrayList<>();batch.add(first);batch.add(second);batch.forEach(shipment->dispatch.enqueue(shipment));int total=dispatch.drain();dispatch.accepted.forEach(dispatch::mark);
  Phase phase=Phase.SENT;Shipment selected=dispatch.byLabel.get("Harbor");
  try{pricing.cost(new Shipment("Invalid",-1));}catch(IllegalArgumentException failure){System.err.println("rejected:"+failure.getMessage());}
  Path report=Path.of("dispatch.csv");String text=first.label()+","+total+","+Dispatch.sent+","+phase.name()+"\n";Files.writeString(report,text,StandardCharsets.UTF_8);String readback=Files.readString(report,StandardCharsets.UTF_8);
  System.out.print(readback);System.out.println((alias==cargo)+":"+(selected==first)+":"+(capacities[2]==null)+":"+dispatch.pending.size());
 }
}
