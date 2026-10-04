import java.util.*;
public class Main {
 static boolean armed;static int violations;
 static void forbidden(){if(armed){violations++;throw new AssertionError("observer ran user callback");}}
 static class Key {final int id;Key(int id){this.id=id;}public int hashCode(){forbidden();return id;}public boolean equals(Object other){forbidden();return this==other;}public String toString(){forbidden();return "key";}}
 static class HostileList extends ArrayList<Object>{public int size(){forbidden();return super.size();}public Object get(int index){forbidden();return super.get(index);}public Iterator<Object> iterator(){forbidden();return super.iterator();}public Object[] toArray(){forbidden();return super.toArray();}public String toString(){forbidden();return "list";}}
 static class HostileMap extends HashMap<Object,Object>{public int size(){forbidden();return super.size();}public Set<Map.Entry<Object,Object>> entrySet(){forbidden();return super.entrySet();}public String toString(){forbidden();return "map";}}
 static class HostileSet extends HashSet<Object>{public int size(){forbidden();return super.size();}public Iterator<Object> iterator(){forbidden();return super.iterator();}}
 static class HostileComparator implements Comparator<Key>{public int compare(Key a,Key b){forbidden();return Integer.compare(a.id,b.id);}}
 static void boundary(Object value){}
 public static void main(String[] args){
  Key key=new Key(1);Key second=new Key(2);HostileList list=new HostileList();list.add(key);HostileMap map=new HostileMap();map.put(key,second);HostileSet set=new HostileSet();set.add(key);HashMap<Key,Object> exactMap=new HashMap<>();exactMap.put(key,list);HashSet<Key> exactSet=new HashSet<>();exactSet.add(key);TreeSet<Key> sorted=new TreeSet<>(new HostileComparator());sorted.add(key);sorted.add(second);armed=true;
  boundary(list);boundary(map);boundary(set);boundary(exactMap);boundary(exactSet);boundary(sorted);boundary(key);armed=false;System.out.println("violations="+violations);if(violations!=0)throw new AssertionError("observation changed behavior");
 }
}
