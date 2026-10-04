import java.util.HashSet;
public class Main {
 static void checkpoint(Object value){}
 static class Flag {int code;Flag(int code){this.code=code;}}
 public static void main(String[] args){Flag red=new Flag(1);Flag blue=new Flag(2);HashSet<Flag> set=new HashSet<>();set.add(red);set.add(blue);set.add(red);set.add(null);checkpoint(set);boolean contains=set.contains(red);set.remove(red);checkpoint(set);System.out.println(contains+":"+set.size());}
}
