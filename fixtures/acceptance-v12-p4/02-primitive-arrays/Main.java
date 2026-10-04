public class Main {
 public static void main(String[] args){
 byte[] bytes=new byte[2];short[] shorts=new short[2];int[] ints=new int[2];long[] longs=new long[2];float[] floats=new float[2];double[] doubles=new double[2];boolean[] flags=new boolean[2];char[] chars=new char[2];
 bytes[1]=-128;shorts[1]=32767;ints[1]=-2147483648;longs[1]=9007199254740993L;floats[1]=-0.0f;doubles[1]=Double.NEGATIVE_INFINITY;flags[1]=true;chars[1]='\uD800';
 byte b=bytes[1];short s=shorts[1];int i=ints[1];long l=longs[1];float f=floats[1];double d=doubles[1];boolean z=flags[1];char c=chars[1];
 System.out.println(b+":"+s+":"+i+":"+l+":"+f+":"+d+":"+z+":"+(int)c);
 }
}
