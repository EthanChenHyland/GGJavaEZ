import java.util.LinkedList;
public class Main {
 static void checkpoint(Object value){}
 static class Job {int code;Job(int code){this.code=code;}}
 public static void main(String[] args){Job head=new Job(8);Job tail=new Job(9);LinkedList<Job> list=new LinkedList<>();list.add(head);list.add(tail);checkpoint(list);Job chosen=list.get(1);list.set(0,tail);checkpoint(list);list.removeLast();checkpoint(list);list.clear();checkpoint(list);System.out.println(chosen.code+":"+list.size());}
}
