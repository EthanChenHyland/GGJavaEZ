import java.util.HashMap;
public class Main {
 static void checkpoint(Object value){}
 static class Dock {int number;Dock(int number){this.number=number;}}
 public static void main(String[] args){Dock north=new Dock(14);Dock south=new Dock(22);HashMap<String,Dock> map=new HashMap<>();map.put("north",north);map.put("south",south);map.put(null,null);checkpoint(map);Dock chosen=map.get("south");map.remove("north");checkpoint(map);map.clear();checkpoint(map);System.out.println(chosen.number+":"+map.size());}
}
