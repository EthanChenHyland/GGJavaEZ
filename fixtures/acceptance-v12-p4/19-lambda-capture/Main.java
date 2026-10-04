import java.util.ArrayList;
public class Main {
 static int total;
 static void accumulate(int value){total+=value;}
 public static void main(String[] args){int multiplier=3;ArrayList<Integer> values=new ArrayList<>();values.add(2);values.add(5);values.forEach(value->accumulate(value*multiplier));Runnable action=()->accumulate(1);action.run();System.out.println(total);}
}
