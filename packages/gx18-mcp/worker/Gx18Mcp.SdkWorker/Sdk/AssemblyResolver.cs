using System;
using System.IO;
using System.Reflection;

namespace Gx18Mcp.SdkWorker.Sdk
{
    public class AssemblyResolver
    {
        private readonly string _gx18Dir;

        public AssemblyResolver(string gx18Dir) { _gx18Dir = gx18Dir; }

        public void Register()
        {
            AppDomain.CurrentDomain.AssemblyResolve += OnAssemblyResolve;
        }

        private Assembly OnAssemblyResolve(object sender, ResolveEventArgs args)
        {
            var asmName = new AssemblyName(args.Name).Name;
            var path = Path.Combine(_gx18Dir, asmName + ".dll");
            if (File.Exists(path))
            {
                Console.Error.WriteLine($"[gx18-worker] Loading: {asmName}");
                return Assembly.LoadFrom(path);
            }
            return null;
        }
    }
}
