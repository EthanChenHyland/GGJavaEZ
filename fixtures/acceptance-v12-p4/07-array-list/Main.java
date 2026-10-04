import java.util.ArrayList;
public class Main {
 static void checkpoint(Object value){}
 static class Crate {int code;Crate(int code){this.code=code;}}
 public static void main(String[] args){Crate one=new Crate(1);Crate two=new Crate(2);ArrayList<Crate> list=new ArrayList<>();list.add(one);checkpoint(list);list.add(two);checkpoint(list);Crate chosen=list.get(1);list.set(0,two);checkpoint(list);list.remove(1);checkpoint(list);list.clear();checkpoint(list);System.out.println(chosen.code+":"+list.size());}
}
