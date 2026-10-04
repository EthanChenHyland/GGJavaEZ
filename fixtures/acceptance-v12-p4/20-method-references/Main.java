import java.util.ArrayList;
public class Main {
 int total;
 void process(int value){total+=value;}
 public static void main(String[] args){Main worker=new Main();ArrayList<Integer> values=new ArrayList<>();values.add(2);values.add(7);values.forEach(worker::process);values.forEach(System.out::println);System.out.println("total="+worker.total);}
}
