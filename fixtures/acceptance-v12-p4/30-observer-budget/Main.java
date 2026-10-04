public class Main {
 static long total;
 public static void main(String[] args){long[] values=new long[1];for(int i=0;i<3000;i++){values[0]+=2;total+=values[0];}System.out.println(values[0]+":"+total);try{int zero=0;int result=1/zero;System.out.println(result);}catch(ArithmeticException failure){System.err.println("caught-after-limit");}System.out.println("continued");}
}
