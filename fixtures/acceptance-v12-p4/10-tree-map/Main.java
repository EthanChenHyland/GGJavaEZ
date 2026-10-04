import java.util.TreeMap;
public class Main {
 static void checkpoint(Object value){}
 static class Dock {int number;Dock(int number){this.number=number;}}
 public static void main(String[] args){Dock east=new Dock(12);Dock west=new Dock(29);TreeMap<String,Dock> map=new TreeMap<>();map.put("west",west);map.put("east",east);map.put("void",null);checkpoint(map);Dock chosen=map.get("west");map.remove("void");checkpoint(map);System.out.println(map.firstKey()+":"+chosen.number+":"+map.size());}
}
