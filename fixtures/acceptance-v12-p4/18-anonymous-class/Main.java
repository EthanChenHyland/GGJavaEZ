public class Main {
 interface Compute {int apply(int value);}
 public static void main(String[] args){int offset=4;Compute compute=new Compute(){public int apply(int value){return value+offset;}};int result=compute.apply(9);System.out.println(result);}
}
