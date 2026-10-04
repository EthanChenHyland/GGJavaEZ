import java.util.ArrayList;
public class Main {
 static int attempts;static long[] samples=new long[]{9007199254740993L};
 static long failing(ArrayList<Long> list){attempts++;long value=samples[3];return list.get(0)+value;}
 public static void main(String[] args){ArrayList<Long> list=new ArrayList<>();list.add(7L);try{failing(list);}catch(ArrayIndexOutOfBoundsException failure){System.out.println("caught:"+attempts+":"+list.get(0));}try{Object[] narrowed=new String[1];narrowed[0]=new Object();}catch(ArrayStoreException failure){System.out.println("store-failed");}System.err.println("still-running");}
}
