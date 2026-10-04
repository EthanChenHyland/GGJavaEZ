import java.util.ArrayList;
public class Main {
 static void boundary(Object value){}
 public static void main(String[] args){String text="cargo".repeat(20000);long[] values=new long[100000];values[99999]=9007199254740993L;long last=values[99999];ArrayList<String> list=new ArrayList<>();for(int i=0;i<40;i++)list.add(text);boundary(text);boundary(values);boundary(list);System.out.println(text.length()+":"+last+":"+list.size());}
}
