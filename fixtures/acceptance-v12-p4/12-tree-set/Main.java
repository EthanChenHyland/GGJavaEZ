import java.util.TreeSet;
public class Main {
 static void checkpoint(Object value){}
 public static void main(String[] args){TreeSet<String> set=new TreeSet<>();set.add("pear");set.add("apple");set.add("fig");checkpoint(set);set.remove("fig");checkpoint(set);System.out.println(set.first()+":"+set.last()+":"+set.size());}
}
